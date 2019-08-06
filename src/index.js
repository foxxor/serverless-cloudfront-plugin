'use strict';

const aws = require('aws-sdk');

const CF_LAMBDA_EVENTS = {
    viewerRequest : 'viewer-request',
    viewerResponse: 'viewer-response',
    originRequest : 'origin-request',
    originResponse: 'origin-response'
};

const CF_COOKIE_FORWARD_VALUES = {
    none     : 'none',
    whitelist: 'whitelist',
    all      : 'all',
};

class CloudfrontPlugin 
{
    constructor( serverless, options ) 
    {
        this.serverless = serverless;
        this.options    = options;
        this.custom     = this.serverless.service.custom;

        this.commands = {
            'deploy-distribution': {
                usage: 'Deploys your lambda@edge to a CloudFront distribution',
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
                || !( 'behaviours'   in this.custom.cloudfront ) ) 
            {
                throw Error( `${this.constructor.name}: Missing one or more configuration values.` );
            }
        }

        this.config = this.custom.cloudfront;
    }

    /**
     * Deploy all the functions to the CloudFront Distribution
     */
    async deployFunctions() 
    {
        this.getConfiguration();

        if ( this.config === undefined )
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

        let distribution = await this.getDistribution( this.config.distributionId );
        distribution.DistributionConfig = this.addNewConfigToDistribution( distribution.DistributionConfig, lambdaFunctions );

        // Update the CF Distribution with the new versions
        await this.updateDistributionConfig( distribution );

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
            functions[ functionNames[ index ] ] = await this.getLastestVersion( lambdaFunction.name );
        }

        return functions;
    }

    /**
     * Gets the function version number
     * @param  {String} functionName
     * @param  {String} paginationMarker
     * @return {Promise|Object}
     */
    getLastestVersion( functionName, paginationMarker )
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
                    return this.getLastestVersion( functionName, data.NextMarker )
                    .then( lastVersion =>
                        {
                            resolve( lastVersion );
                        }
                    );
                }

                let lastVersion = data.Versions.pop();
                this.serverless.cli.log( `Obtained lambda function latest version: ${lastVersion.Version}` );
                return resolve( lastVersion );
            } );
        } );
    }

    /**
     * Gets a CloudFront distribution
     * @param  {String} distributionId
     * @return {Promise|Object}
     */
    getDistribution( distributionId )
    {
        const Cloudfront = this.getCloudfront();

        const params = {
          Id: distributionId
        };

        return new Promise( ( resolve, reject ) => 
        {
            Cloudfront.getDistribution( params, ( err, data ) => 
            {
                if ( err ) 
                {
                    this.serverless.cli.log( `${this.constructor.name}: Couldn't get the CloudFront Distribution: ${JSON.stringify( err )}` );
                    return reject( err );
                }

                resolve( data );
            } );
        } );
    }

    /**
     * Updates the Cloudfront Distribution configuration
     * @param  {Object} distribution
     * @return {Promise|Object}
     */
    updateDistributionConfig( distribution )
    {
        const Cloudfront = this.getCloudfront();

        const params = {
            Id                : distribution.Distribution.Id,
            IfMatch           : distribution.ETag,
            DistributionConfig: distribution.DistributionConfig
        };

        return new Promise( ( resolve, reject ) => 
        {
            Cloudfront.updateDistribution( params, ( err, data ) =>
            {
                if ( err )
                {
                    this.serverless.cli.log( `${this.constructor.name}: Couldn't update the CloudFront Distribution: ${JSON.stringify( err )}` );
                    return reject( err );
                }
                
                resolve( data );
            });
        } );
    }

    /**
     * Replaces the Distribution configuration with the new function version
     * @param  {Object} distributionConfig
     * @param  {Object} lambdaFunctions
     * @return {Object}
     */
    addNewConfigToDistribution( distributionConfig, lambdaFunctions )
    {
        for ( let index in distributionConfig.CacheBehaviors.Items )
        {
            let behavior = distributionConfig.CacheBehaviors.Items[ index ];

            // Check if the current behaviour matches the behaviours in the configuration
            if ( this.config.behaviours[ behavior.PathPattern ] )
            {
                const behaviorEvents     = this.config.behaviours[ behavior.PathPattern ];
                const lambdaAssociations = this.createDistributionLambdaAssociations( behaviorEvents, lambdaFunctions );

                if ( lambdaAssociations.length )
                {
                    this.serverless.cli.log( `Adding lambda associations for behaviour '${behavior.PathPattern}'` );

                    distributionConfig.CacheBehaviors.Items[ index ].LambdaFunctionAssociations.Quantity = lambdaAssociations.length;
                    distributionConfig.CacheBehaviors.Items[ index ].LambdaFunctionAssociations.Items    = lambdaAssociations;
                }
            }

            // Check if the current behaviour matches the cookies in the configuration
            if ( this.config.whitelistedCookies[ behavior.PathPattern ] )
            {
                const behaviorCookies  = this.config.whitelistedCookies[ behavior.PathPattern ];

                if ( behaviorCookies.length )
                {
                    this.serverless.cli.log( `Adding whitelisted cookies for behaviour '${behavior.PathPattern}'` );

                    let cookiesConfig = {
                        Forward: CF_COOKIE_FORWARD_VALUES['whitelist'],
                        WhitelistedNames: {
                            Quantity: behaviorCookies.length,
                            Items   : behaviorCookies
                        }
                    };

                    distributionConfig.CacheBehaviors.Items[ index ].ForwardedValues.Cookies = cookiesConfig;
                }
            }
        }

        return distributionConfig;
    }

    /**
     * Creates the CF Distribution Lambda Function Associations object
     * @param {Object} eventsToAssociate
     * @param {Array}  lambdaFunctions
     */
    createDistributionLambdaAssociations( eventsToAssociate, lambdaFunctions )
    {
        let lambdaAssociations = [];

        for ( let eventType in CF_LAMBDA_EVENTS )
        {
            if ( eventType in eventsToAssociate )
            {
                let lambdaAssociation = {
                    LambdaFunctionARN: lambdaFunctions[ eventsToAssociate[ eventType ] ].FunctionArn,
                    EventType        : CF_LAMBDA_EVENTS[ eventType ]
                };

                lambdaAssociations.push( lambdaAssociation );
            }
        }

        return lambdaAssociations;
    }

    /**
     * Gets an instance of the Lambda AWS class
     */
    getLambda()
    {
        aws.config.update( {
            region: this.serverless.service.provider.region
        } );
        return new aws.Lambda( { apiVersion: '2015-03-31' } );
    }

    /**
     * Gets an instance of the Lambda AWS class
     */
    getCloudfront()
    {
        return new aws.CloudFront( { apiVersion: '2019-03-26' } );
    }
}

module.exports = CloudfrontPlugin;
