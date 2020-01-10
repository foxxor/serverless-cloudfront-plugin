'use strict';

const AWS = require('aws-sdk');

const CloudfrontConnector = require('./lib/connectors/CloudfrontConnector');

class CloudfrontPlugin 
{
    constructor( serverless, options ) 
    {
        this.serverless = serverless;
        this.options    = options;
        this.custom     = this.serverless.service.custom;

        this.commands = {
            'deploy-distribution': {
                usage: 'Deploys your Lambda@Edge to a CloudFront distribution',
                lifecycleEvents: [
                    'deploy'
                ],
                options: {}   
            },
        };

        this.hooks = {
            'after:deploy:finalize': this.deployFunctions.bind( this ),
        };
    }

    /**
     * Gets the Plug-in configuration from the serverless config file
     */
    getConfiguration()
    {
        if ( 'cloudfront' in this.custom )
        {
            if ( !( 'distributionId' in this.custom.cloudfront ) 
                || !( 'behaviors' in this.custom.cloudfront ) ) 
            {
                throw Error( `${this.constructor.name}: Missing one or more configuration values.` );
            }
        }

        const provider = this.serverless.service.provider;
        if ( provider.name !== 'aws' )
        {
            throw Error( `${this.constructor.name}: This plugin only supports the aws provider.` );
        }

        this.config = this.custom.cloudfront;
    }

    /**
     * Deploy all the functions to the CloudFront Distribution
     */
    async deployFunctions()
    {
        const cloudfrontConnector = new CloudfrontConnector();

        this.getConfiguration();

        if ( this.config === undefined 
            || Object.keys( this.config ).length == 0 
            || !this.config.distributionId
            || !this.config.behaviors
            || this.config.behaviors.length == 0 )
        {
            this.serverless.cli.log( `${this.constructor.name}: No configuration found. Continuing without any changes.` )
            return;
        }

        this.serverless.cli.log( `${this.constructor.name}: Starting...` )

        // Get the functions
        const functionNames   = this.serverless.service.getAllFunctions();
        const lambdaFunctions = await this.getLambdaFunctions( functionNames );

        // Get the CF Distribution configuration
        this.serverless.cli.log(`Deploying lambda functions to CF Distribution: ${this.config.distributionId}`);

        let distribution = await cloudfrontConnector.getDistribution( this.config.distributionId );
        distribution.Distribution.DistributionConfig = cloudfrontConnector.addNewConfigToDistribution( 
            distribution.Distribution.DistributionConfig, lambdaFunctions, this.config.behaviors );

        // Update the CF Distribution with the new versions
        await cloudfrontConnector.updateDistributionConfig( distribution );

        this.serverless.cli.log( `${this.constructor.name}: Finished process correctly.` )
    }

    /**
     * Gets all the passed functions versions
     * @param  {Array} functionNames
     * @return {Object}
     */
    async getLambdaFunctions( functionNames )
    {
        let functions = {};

        // Get version for each function
        for ( let index in functionNames )
        {
            this.serverless.cli.log( `Getting version for: ${functionNames[ index ]}` );

            const lambdaFunction = this.serverless.service.getFunction( functionNames[ index ] );
            functions[ functionNames[ index ] ] = await this.getLatestVersion( lambdaFunction.name );
        }

        return functions;
    }

    /**
     * Gets the function latest/newest version number
     * @param  {String} functionName
     * @param  {String} paginationMarker
     * @return {Promise|Object}
     */
    getLatestVersion( functionName, paginationMarker )
    {
        const Lambda = this.getLambda();

        return new Promise( ( resolve, reject ) => 
        {
            const params = {
                FunctionName: functionName,
                // This method paginates just up to 50 versions, even when the documentation says 10000
                MaxItems: 50
            };

            // If a pagination marker was passed to the function, include it to get the next page
            if ( paginationMarker )
            {
                params.Marker = paginationMarker;
            }

            Lambda.listVersionsByFunction( params, ( err, data ) =>
            {
                if ( err ) 
                {
                    this.serverless.cli.log( `${this.constructor.name}: Couldn't get function versions: ${JSON.stringify( err )}` );
                    return reject( err );
                }

                // This means the versions are paginated
                if ( data.NextMarker )
                {
                    // Recursively call this function but with the pagination marker
                    return this.getLatestVersion( functionName, data.NextMarker )
                    .then( lastestVersion =>
                    {
                        resolve( lastestVersion );
                    } );
                }

                let lastVersion = data.Versions.pop();
                this.serverless.cli.log( `Obtained lambda function latest version: ${lastVersion.Version}` );
                return resolve( lastVersion );
            } );
        } );
    }

    /**
     * Gets an instance of the Lambda AWS class
     * @return {AWS.Lambda}
     */
    getLambda()
    {
        AWS.config.update( {
            region: this.serverless.service.provider.region
        } );
        return new AWS.Lambda();
    }
}

module.exports = CloudfrontPlugin;
