'use strict';

const AWS = require('aws-sdk');

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

class CloudfrontConnector 
{
    constructor()
    {
        this.cloudfront = new AWS.CloudFront( { apiVersion: '2019-03-26' } );
    }

    /**
     * Gets a CloudFront distribution
     * @async
     * @param  {String} distributionId
     * @return {Object}
     */
    async getDistribution( distributionId )
    {
        const params = {
          Id: distributionId
        };

        let distribution = await this.cloudfront.getDistribution( params ).promise()
        .catch( err => 
        {
            console.log( `${this.constructor.name}: Couldn't get the CloudFront Distribution: ${JSON.stringify( err )}` );
            throw err;
        } );

        return distribution;
    }

    /**
     * Updates the Cloudfront Distribution configuration
     * @async
     * @param  {Object} distribution
     * @return {Object}
     */
    async updateDistributionConfig( distribution )
    {
        const params = {
            Id                : distribution.Distribution.Id,
            IfMatch           : distribution.ETag,
            DistributionConfig: distribution.Distribution.DistributionConfig
        };

        let updatedDistribution = await this.cloudfront.updateDistribution( params ).promise()
        .catch( err => 
        {
            console.log( `${this.constructor.name}: Couldn't update the CloudFront Distribution: ${JSON.stringify( err )}` );
            throw err;
        } );

        return updatedDistribution;
    }

    /**
     * Replaces the Distribution configuration with the new function version
     * @param  {Object} distributionConfig
     * @param  {Object} lambdaFunctions
     * @param  {Object} behaviorsConfig
     * @return {Object}
     */
    addNewConfigToDistribution( distributionConfig, lambdaFunctions, behaviorsConfig )
    {
        for ( let index in distributionConfig.CacheBehaviors.Items )
        {
            let behavior = distributionConfig.CacheBehaviors.Items[ index ];

            // Check if the current behaviour matches the behaviours in the configuration
            if ( behaviorsConfig[ behavior.PathPattern ] )
            {
                const behaviorConfig = behaviorsConfig[ behavior.PathPattern ];

                // If disable was passed, then delete all the lambda associations and the whitelisted cookies
                if ( 'disable' in behaviorConfig )
                {
                    distributionConfig.CacheBehaviors.Items[ index ] = this.setDisabledCacheBehavior( 
                        distributionConfig.CacheBehaviors.Items[ index ] );
                }
                else 
                {
                    // Check if the current behaviour contains lambda associations
                    if ( 'lambdaAssociations' in behaviorConfig )
                    {
                        distributionConfig.CacheBehaviors.Items[ index ] = this.setCacheBehaviorLambdaAssociations( 
                            distributionConfig.CacheBehaviors.Items[ index ], behaviorConfig.lambdaAssociations, lambdaFunctions );
                    }

                    // Check if the current behaviour contains cookies to whitelist
                    if ( 'cookies' in behaviorConfig )
                    {
                        distributionConfig.CacheBehaviors.Items[ index ] = this.setCacheBehaviorCookies( 
                            distributionConfig.CacheBehaviors.Items[ index ],  behaviorConfig.cookies );
                    }
                }
            }
        }

        return distributionConfig;
    }

    /**
     * Sets the Lambda Function Associations for the Distribution's Cache Behavior
     * @param  {Object} eventsToAssociate
     * @param  {Array}  lambdaFunctions
     * @return {Object}
     */
    setCacheBehaviorLambdaAssociations( cacheBehavior, eventsToAssociate, lambdaFunctions )
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

        if ( lambdaAssociations.length )
        {
            console.log( `Adding lambda associations for behaviour '${cacheBehavior.PathPattern}'` );

            cacheBehavior.LambdaFunctionAssociations.Quantity = lambdaAssociations.length;
            cacheBehavior.LambdaFunctionAssociations.Items    = lambdaAssociations;
        }

        return cacheBehavior;
    }

    /**
     * Sets the Whitelisted cookies for the Distribution's Cache Behavior
     * @param  {Object} cacheBehavior
     * @param  {Object} behaviorCookies
     * @return {Object}
     */
    setCacheBehaviorCookies( cacheBehavior, behaviorCookies )
    {
        if ( behaviorCookies.length )
        {
            console.log( `Adding whitelisted cookies for behaviour '${cacheBehavior.PathPattern}'` );

            let cookiesConfig = {
                Forward: CF_COOKIE_FORWARD_VALUES['whitelist'],
                WhitelistedNames: {
                    Quantity: behaviorCookies.length,
                    Items   : behaviorCookies
                }
            };

            cacheBehavior.ForwardedValues.Cookies = cookiesConfig;
        }

        return cacheBehavior;
    }

    /**
     * Adds the disabled state configuration to the Distribution cache behavior
     * @param  {Object} cacheBehavior
     * @return {Object}
     */
    setDisabledCacheBehavior( cacheBehavior )
    {
        let disabledCookiesConfig = {
            Forward: CF_COOKIE_FORWARD_VALUES['none'],
            WhitelistedNames: {
                Quantity: 0,
                Items   : []
            }
        };
        let disabledLambdaConfig = {
            Quantity: 0,
            Items   : []
        };

        cacheBehavior.ForwardedValues.Cookies    = disabledCookiesConfig;
        cacheBehavior.LambdaFunctionAssociations = disabledLambdaConfig;

        return cacheBehavior;
    }
}

module.exports = CloudfrontConnector;
