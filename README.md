# Auth0 - Logs to Azure

[![Auth0 Extensions](http://cdn.auth0.com/extensions/assets/badge.svg)](https://sandbox.it.auth0.com/api/run/auth0-extensions/extensions-badge?webtask_no_cache=1)

This extension will take all of your Auth0 logs and export them to Azure Blob Storage.

## Configure Azure Blob Storage

First you'll need to [create an Azure Storage account](https://portal.azure.com/#create/Microsoft.StorageAccount.1.0.0).

## Configure Webtask

If you haven't configured Webtask on your machine run this first:

```
npm i -g wt-cli
wt init
```

> Requires at least node 0.10.40 - if you're running multiple version of node make sure to load the right version, e.g. "nvm use 0.10.40"

## Deploy to Webtask.io

To run it on a schedule (run every 5 minutes for example):

```
wt cron schedule \
    --name auth0-logs-to-azure \
    --secret AUTH0_DOMAIN="YOUR_AUTH0_DOMAIN" \
    --secret AUTH0_GLOBAL_CLIENT_ID="YOUR_AUTH0_GLOBAL_CLIENT_ID" \
    --secret AUTH0_GLOBAL_CLIENT_SECRET="YOUR_AUTH0_GLOBAL_CLIENT_SECRET" \
    --secret STORAGE_ACCOUNT_NAME="YOUR_STORAGE_ACCOUNT_NAME" \
    --secret STORAGE_ACCOUNT_KEY="YOUR_STORAGE_ACCOUNT_KEY" \
    --secret STORAGE_CONTAINER_NAME="YOUR_STORAGE_CONTAINER_NAME" \
    --json \
    "*/5 * * * *" \
    https://raw.githubusercontent.com/auth0/auth0-logs-to-azure/master/index.js
```

> You can get your Global Client Id/Secret here: https://auth0.com/docs/api/v1

## Usage

Use any Storage Explorer to access your logs. Each record will be saved in the following structure:

```
https://{YOUR_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/{YOUR_STORAGE_CONTAINER_NAME}/YYYY/MM/DD/HH/{LOG_ID}.json
```

This will allow you to process the logs with Stream Analytics for example (which in turn can export them to Power BI).

## Issue Reporting

If you have found a bug or if you have a feature request, please report them at this repository issues section. Please do not report security vulnerabilities on the public GitHub issue tracker. The [Responsible Disclosure Program](https://auth0.com/whitehat) details the procedure for disclosing security issues.

## Author

[Auth0](auth0.com)

## What is Auth0?

Auth0 helps you to:

* Add authentication with [multiple authentication sources](https://docs.auth0.com/identityproviders), either social like **Google, Facebook, Microsoft Account, LinkedIn, GitHub, Twitter, Box, Salesforce, amont others**, or enterprise identity systems like **Windows Azure AD, Google Apps, Active Directory, ADFS or any SAML Identity Provider**.
* Add authentication through more traditional **[username/password databases](https://docs.auth0.com/mysql-connection-tutorial)**.
* Add support for **[linking different user accounts](https://docs.auth0.com/link-accounts)** with the same user.
* Support for generating signed [Json Web Tokens](https://docs.auth0.com/jwt) to call your APIs and **flow the user identity** securely.
* Analytics of how, when and where users are logging in.
* Pull data from other sources and add it to the user profile, through [JavaScript rules](https://docs.auth0.com/rules).

## Create a free Auth0 Account

1. Go to [Auth0](https://auth0.com) and click Sign Up.
2. Use Google, GitHub or Microsoft Account to login.

## License

This project is licensed under the MIT license. See the [LICENSE](LICENSE) file for more info.
