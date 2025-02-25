use appchain_core_contract_client::clients::StarknetCoreContractClient;
use appchain_core_contract_client::interfaces::core_contract::CoreContract;
use starknet::providers::jsonrpc::HttpTransport;
use starknet_providers::Url;
use std::sync::Arc;

use starknet::accounts::{ExecutionEncoding, SingleOwnerAccount};
use starknet::core::types::{
    BlockId, BlockTag, Felt, FunctionCall, TransactionExecutionStatus, U256,
};
use starknet::providers::{JsonRpcClient, Provider};
use starknet::signers::{LocalWallet, SigningKey};
use std::io::Error;
use swiftness_proof_parser::{parse, StarkProof};
use tokio;

pub const PROGRAM_OUTPUT_FILE_NAME: &str = "program_output.txt";

pub const ACCOUNT_ADDRESS: &str =
    "0x0467C4Dc308a65C3247B0907a9A0ceE780704863Bbe38938EeBE3Ab3be783FbA";
pub const PRIVATE_KEY: &str = "";
pub const RPC_URL: &str = "";
pub const CORE_CONTRACT_ADDRESS: &str =
    "0x07f3e6Cc108184631e2D9bDB7f3c2de1363531A398304Dcf5BFaE490EE2a3cdc";

#[tokio::main]
async fn main() -> Result<(), Error> {
    let snos_output = {
        //  read a file called proof.json in this directory into bytes
        let input_path = format!("assets/proof.json");
        let raw_data = tokio::fs::read(&input_path).await?;
        let snos_proof = String::from_utf8(raw_data)
            .map_err(|e| Error::new(std::io::ErrorKind::InvalidData, e))?;

        let parsed_snos_proof: StarkProof = parse(snos_proof.clone())
            .map_err(|e| Error::new(std::io::ErrorKind::InvalidData, e))?;
        let snos_output = vec_felt_to_vec_bytes32(calculate_output(parsed_snos_proof));
        slice_slice_u8_to_vec_field(snos_output.as_slice())
    };

    let layout_bridge_output = {
        //  read a file called proof.json in this directory into bytes
        let input_path = format!("assets/proof_part2.json");
        let raw_data = tokio::fs::read(&input_path).await?;
        let second_proof = String::from_utf8(raw_data)
            .map_err(|e| Error::new(std::io::ErrorKind::InvalidData, e))?;
        let parsed_bridge_proof: StarkProof = parse(second_proof.clone())
            .map_err(|e| Error::new(std::io::ErrorKind::InvalidData, e))?;
        let output = vec_felt_to_vec_bytes32(calculate_output(parsed_bridge_proof));
        slice_slice_u8_to_vec_field(output.as_slice())
    };

    let onchain_data_hash = Felt::from_hex("0x1").unwrap();
    let onchain_data_size: [u8; 32] = [0; 32];
    let low = u128::from_be_bytes(onchain_data_size[16..32].try_into().unwrap());
    let high = u128::from_be_bytes(onchain_data_size[0..16].try_into().unwrap());
    let size = U256::from_words(low, high);

    let signer_address = Felt::from_hex(ACCOUNT_ADDRESS).unwrap();

    let private_key = Felt::from_hex(PRIVATE_KEY).unwrap();
    let signing_key = SigningKey::from_secret_scalar(private_key);
    let signer = LocalWallet::from(signing_key);

    let provider: Arc<JsonRpcClient<HttpTransport>> = Arc::new(JsonRpcClient::new(
        HttpTransport::new(Url::parse(RPC_URL).unwrap()),
    ));
    let chain_id = provider.chain_id().await.expect("Failed to get chain id");

    let mut account = SingleOwnerAccount::new(
        provider.clone(),
        signer,
        signer_address,
        chain_id,
        ExecutionEncoding::New,
    );
    // Set block ID to Pending like in the reference implementation
    account.set_block_id(BlockId::Tag(BlockTag::Pending));
    let account = Arc::new(account);

    let core_contract_address = Felt::from_hex(CORE_CONTRACT_ADDRESS).unwrap();

    let starknet_core_contract_client =
        StarknetCoreContractClient::new(core_contract_address, account.clone());

    let core_contract: &CoreContract = starknet_core_contract_client.as_ref();

    let invoke_result = core_contract
        .update_state(snos_output, layout_bridge_output, onchain_data_hash, size)
        .await
        .expect("Failed to update state");

    println!(
        "invoke_result: {:?}",
        invoke_result.transaction_hash.to_string()
    );
    Ok(())
}

pub fn calculate_output(proof: StarkProof) -> Vec<Felt> {
    let output_segment = proof.public_input.segments[2].clone();
    let output_len = output_segment.stop_ptr - output_segment.begin_addr;
    let start = proof.public_input.main_page.len() - output_len as usize;
    let end = proof.public_input.main_page.len();
    let program_output = proof.public_input.main_page[start..end]
        .iter()
        .map(|cell| cell.value.clone())
        .collect::<Vec<_>>();
    let mut felts = vec![];
    for elem in &program_output {
        felts.push(Felt::from_dec_str(&elem.to_string()).unwrap());
    }
    felts
}

pub fn vec_felt_to_vec_bytes32(felts: Vec<Felt>) -> Vec<[u8; 32]> {
    felts
        .into_iter()
        .map(|felt| {
            let mut bytes = [0u8; 32];
            bytes.copy_from_slice(&felt.to_bytes_be());
            bytes
        })
        .collect()
}

pub(crate) fn slice_slice_u8_to_vec_field(slices: &[[u8; 32]]) -> Vec<Felt> {
    slices.iter().map(slice_u8_to_field).collect()
}
pub(crate) fn slice_u8_to_field(slice: &[u8; 32]) -> Felt {
    Felt::from_bytes_be_slice(slice)
}

// #[tokio::main]
// async fn main() -> Result<(), Error> {
//     let block_number = 451;

//     // Read and deserialize
//     let input_path = format!("{}/{}", block_number, PROGRAM_OUTPUT_FILE_NAME);
//     let raw_data = tokio::fs::read(&input_path).await?;

//     let deserialized: Vec<[u8; 32]> = bincode::deserialize(&raw_data)
//         .map_err(|e| Error::new(std::io::ErrorKind::InvalidData, e))?;

//     let felt_based: Vec<Felt> = deserialized
//         .iter()
//         .map(|x| Felt::from_bytes_be(x))
//         .collect();

//     println!(" {}.at(2) : {:?}", PROGRAM_OUTPUT_FILE_NAME, felt_based[2]);

//     // Display the deserialized data
//     println!("Read {} elements from {}", deserialized.len(), input_path);
//     Ok(())
// }
