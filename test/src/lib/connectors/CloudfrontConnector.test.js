'use strict';

const assert = require('chai').assert;
const AWS    = require('aws-sdk-mock');

const CloudfrontConnector = require('../../../../src/lib/connectors/CloudfrontConnector');

describe('CloudfrontConnector', () => 
{
    it( 'Tests a distribution is retrieved correctly', async () => 
    {
        AWS.mock( 'CloudFront', 'getDistribution', require('../../../fixtures/cloudfront_distribution_data.json') );

        const connector = new CloudfrontConnector();

        let distributionId = 'ABC123EDF456';
        let distribution   = await connector.getDistribution( distributionId );

        assert.equal( distribution.Distribution.Id, distributionId );

        // Restores the context
        AWS.restore();
    } );

    it( 'Tests a distribution config is updated correctly', async () => 
    {
        const newDistribution = require('../../../fixtures/cloudfront_distribution_data.json');

        AWS.mock( 'CloudFront', 'updateDistribution', newDistribution );

        const connector = new CloudfrontConnector();
        const updatedDistribution = await connector.updateDistributionConfig( newDistribution );

        assert.equal( newDistribution.Distribution.Id, updatedDistribution.Distribution.Id );

        // Restores the context
        AWS.restore();
    } );

    it( 'Tests the lambda associations configuration is generated correctly', async () => 
    {
        const connector    = new CloudfrontConnector();
        const distribution = require('../../../fixtures/cloudfront_distribution_data.json');

        const eventsToAssociate = {
            viewerResponse: 'viewer-response',
            originRequest : 'origin-request'
        };

        let lambdaFunctions = {
            'viewer-response': {
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:ViewerResponseFunction'
            },
            'origin-request': {
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:OriginRequestFunction'
            }
        };

        let cacheBehavior = distribution.Distribution.DistributionConfig.CacheBehaviors.Items[0];
        cacheBehavior     = connector.setCacheBehaviorLambdaAssociations( cacheBehavior, 
            eventsToAssociate, lambdaFunctions );

        assert.equal( cacheBehavior.LambdaFunctionAssociations.Items[0].LambdaFunctionARN, 
            lambdaFunctions['viewer-response'].FunctionArn );
        assert.equal( cacheBehavior.LambdaFunctionAssociations.Items[0].EventType, 'viewer-response' );
        
        assert.equal( cacheBehavior.LambdaFunctionAssociations.Items[1].LambdaFunctionARN, 
            lambdaFunctions['origin-request'].FunctionArn );
        assert.equal( cacheBehavior.LambdaFunctionAssociations.Items[1].EventType, 'origin-request' );
    } );

    it( 'Tests the distribution is updated with new configuration', async () => 
    {
        const connector    = new CloudfrontConnector();
        const distribution = require('../../../fixtures/cloudfront_distribution_data.json');

        let lambdaFunctions = {
            'my-awesome-function': {
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:MyAwesomeFunction'
            },
            'my-other-awesome-function': {
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:OtherAwesomeFunction'
            }
        };

        const behaviorsConfig = {
            '/pages_contents/*': {
                cookies: [ 'oatmeal_cookie', 'chocolate-cookie' ],
                lambdaAssociations: {
                    viewerResponse: 'my-other-awesome-function',
                    originRequest : 'my-awesome-function'
                }
            },
            '*special-route/*': {
                // No cookies,
                lambdaAssociations: {
                    viewerResponse: 'my-other-awesome-function',
                }
            }
        };

        let newDistributionConfig = connector.addNewConfigToDistribution( distribution.Distribution.DistributionConfig, 
            lambdaFunctions, behaviorsConfig );

        assert.equal( newDistributionConfig.DefaultCacheBehavior.LambdaFunctionAssociations.Items.length, 0 );
        assert.equal( newDistributionConfig.DefaultCacheBehavior.LambdaFunctionAssociations.Quantity, 0 );

        assert.equal( newDistributionConfig.CacheBehaviors.Items[0].LambdaFunctionAssociations.Items.length, 2 );
        assert.equal( newDistributionConfig.CacheBehaviors.Items[0].LambdaFunctionAssociations.Quantity, 2 );
        assert.equal( newDistributionConfig.CacheBehaviors.Items[0].ForwardedValues.Cookies.WhitelistedNames.Items.length, 2 );
        assert.equal( newDistributionConfig.CacheBehaviors.Items[0].ForwardedValues.Cookies.WhitelistedNames.Quantity, 2 );
        assert.equal( newDistributionConfig.CacheBehaviors.Items[0].ForwardedValues.Cookies.Forward, 'whitelist' );

        assert.equal( newDistributionConfig.CacheBehaviors.Items[1].LambdaFunctionAssociations.Items.length, 1 );
        assert.equal( newDistributionConfig.CacheBehaviors.Items[1].LambdaFunctionAssociations.Quantity, 1 );
        assert.notExists( newDistributionConfig.CacheBehaviors.Items[1].ForwardedValues.Cookies.WhitelistedNames );
    } );

    it( 'Tests the distribution is updated with new configuration, with a default cache behaviour', async () => 
    {
        const connector    = new CloudfrontConnector();
        const distribution = require('../../../fixtures/cloudfront_distribution_data.json');

        let lambdaFunctions = {
            'my-awesome-function': {
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:MyAwesomeFunction'
            },
            'my-other-awesome-default-function': {
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:OtherAwesomeDefaultFunction'
            }
        };

        const behaviorsConfig = {
            '/pages_contents/*': {
                cookies: [ 'oatmeal_cookie', 'chocolate-cookie' ],
                lambdaAssociations: {
                    originRequest : 'my-awesome-function'
                }
            },
            'DefaultCacheBehavior': {
                // No cookies,
                lambdaAssociations: {
                    originResponse: 'my-other-awesome-default-function'
                }
            }
        };

        let newDistributionConfig = connector.addNewConfigToDistribution( distribution.Distribution.DistributionConfig, 
            lambdaFunctions, behaviorsConfig );

        assert.equal( newDistributionConfig.DefaultCacheBehavior.LambdaFunctionAssociations.Items.length, 1 );
        assert.equal( newDistributionConfig.DefaultCacheBehavior.LambdaFunctionAssociations.Quantity, 1 );

        assert.equal( newDistributionConfig.CacheBehaviors.Items[0].LambdaFunctionAssociations.Items.length, 1 );
        assert.equal( newDistributionConfig.CacheBehaviors.Items[0].LambdaFunctionAssociations.Quantity, 1 );
        assert.equal( newDistributionConfig.CacheBehaviors.Items[0].ForwardedValues.Cookies.WhitelistedNames.Items.length, 2 );
        assert.equal( newDistributionConfig.CacheBehaviors.Items[0].ForwardedValues.Cookies.WhitelistedNames.Quantity, 2 );
        assert.equal( newDistributionConfig.CacheBehaviors.Items[0].ForwardedValues.Cookies.Forward, 'whitelist' );
    } );  

    it( 'Tests the distribution configuration is deleted if the disable is passed', async () => 
    {
        const connector    = new CloudfrontConnector();
        const distribution = require('../../../fixtures/cloudfront_distribution_data.json');

        let lambdaFunctions = {
            'my-awesome-function': {
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:MyAwesomeFunction'
            },
            'my-other-awesome-function': {
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:OtherAwesomeFunction'
            }
        };

        // First add the configuration
        const behaviorsConfig = {
            '*special-route/*': {
                cookies: [ 'oatmeal_cookie', 'chocolate-cookie' ],
                lambdaAssociations: {
                    viewerResponse: 'my-other-awesome-function',
                }
            }
        };

        let newDistributionConfig = connector.addNewConfigToDistribution( distribution.Distribution.DistributionConfig, 
            lambdaFunctions, behaviorsConfig );

        assert.equal( newDistributionConfig.CacheBehaviors.Items[1].LambdaFunctionAssociations.Items.length, 1 );
        assert.equal( newDistributionConfig.CacheBehaviors.Items[1].LambdaFunctionAssociations.Quantity, 1 );
        assert.equal( newDistributionConfig.CacheBehaviors.Items[1].ForwardedValues.Cookies.Forward, 'whitelist' );
        assert.equal( newDistributionConfig.CacheBehaviors.Items[1].ForwardedValues.Cookies.WhitelistedNames.Items.length, 2 );
        assert.equal( newDistributionConfig.CacheBehaviors.Items[1].ForwardedValues.Cookies.WhitelistedNames.Quantity, 2 );

        // Then remove the configuration
        const removedBehaviorsConfig = {
            '*special-route/*': {
                disable: true
            }
        };

        let removedDistributionConfig = connector.addNewConfigToDistribution( newDistributionConfig, 
            lambdaFunctions, removedBehaviorsConfig );

        assert.equal( removedDistributionConfig.CacheBehaviors.Items[1].LambdaFunctionAssociations.Items.length, 0 );
        assert.equal( removedDistributionConfig.CacheBehaviors.Items[1].LambdaFunctionAssociations.Quantity, 0 );
        assert.equal( removedDistributionConfig.CacheBehaviors.Items[1].ForwardedValues.Cookies.WhitelistedNames.Items.length, 0 );
        assert.equal( removedDistributionConfig.CacheBehaviors.Items[1].ForwardedValues.Cookies.WhitelistedNames.Quantity, 0 );
        assert.equal( removedDistributionConfig.CacheBehaviors.Items[1].ForwardedValues.Cookies.Forward, 'none' );
    } );

    it( 'Tests nothing fails if the configuration is empty', async () => 
    {
        const connector    = new CloudfrontConnector();
        const distribution = require('../../../fixtures/cloudfront_distribution_data.json');

        let lambdaFunctions = {
            'my-awesome-function': {
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:MyAwesomeFunction'
            }
        };

        const behaviorsConfig = {};

        let newDistributionConfig = connector.addNewConfigToDistribution( distribution.Distribution.DistributionConfig, 
            lambdaFunctions, behaviorsConfig );
    } );
} );
