const { ACCOUNT_CONFIGS } = require('./config');

module.exports = {
    apps: ACCOUNT_CONFIGS.map((_, index) => ({
        name: `transfer-account-${index}`,
        script: './single-account-transfer.js',
        env: {
            ACCOUNT_INDEX: index
        },
        error_file: `logs/account-${index}-error.log`,
        out_file: `logs/account-${index}-out.log`,
        time: true,
        instance_var: 'INSTANCE_ID',
        watch: true,
        max_memory_restart: '1G',
        autorestart: false, 
        max_restarts: 0
    }))
};
