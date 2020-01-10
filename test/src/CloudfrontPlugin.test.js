'use strict';

const assert = require('chai').assert;
const AWS    = require('aws-sdk-mock');
const sinon  = require('sinon');
const sandbox = sinon.createSandbox();

const CloudfrontConnector = require('../../src/lib/connectors/CloudfrontConnector');
const CloudfrontPlugin    = require('../../src/CloudfrontPlugin');

describe('CloudfrontPlugin', () => 
{
    it( 'Tests a Lambda@Edge function is deployed to Cloudfront correctly.', async () => 
    {
        // Serverless object Mock
        const serverlessMock = {
            service: {
                provider: {
                    name: 'aws',
                    region: 'us-east-1'
                },
                custom: {
                    cloudfront: {
                        distributionId: 'ABC1234DEF',
                        behaviors: {
                            cookies: [ 'chocolate-cookie' ],
                            lambdaAssociations: [ 'awesome-lambda-function' ]
                        }
                    }
                },
                getAllFunctions: () => 
                {
                    return [ 'awesome-lambda-function' ];
                },
                getFunction: () => 
                {
                    return {
                        handler    : 'my-awesome-function.run',
                        description: 'This is an awesome Lambda function!',
                        name       : 'my-awesome-function',
                        memory     : 128,
                        runtime    : "nodejs12.x",
                        vpc        : {},
                        versionLogicalId: 'AwesomeLambdaFunction123'
                    }
                }
            },
            cli: {
                log: msg => {}
            }
        };

        AWS.mock( 'Lambda', 'listVersionsByFunction', require('../fixtures/lambda_versions_data.json') );

        const distribution = require('../fixtures/cloudfront_distribution_data.json');
        sandbox.stub( CloudfrontConnector.prototype, 'getDistribution' ).returns( distribution );

        const connectorMock = sinon.mock( CloudfrontConnector.prototype );
        connectorMock.expects( 'updateDistributionConfig' ).once();

        const plugin = new CloudfrontPlugin( serverlessMock, {} );

        await plugin.deployFunctions();

        // Restore the original methods to avoid other tests from failing
        connectorMock.verify();
        sandbox.restore();
    } );

    it( 'Tests the process quits if no configuration was provided.', async () => 
    {
        // Serverless object Mock
        const serverlessMock = {
            service: {
                provider: {
                    name: 'aws',
                    region: 'us-east-1'
                },
                custom: {
                    cloudfront: {
                        distributionId: 'ABC1234DEF',
                        behaviors: []
                    }
                },
                getAllFunctions: () => 
                {
                    return [ 'awesome-lambda-function' ];
                },
                getFunction: () => 
                {
                    return {
                        handler    : 'my-awesome-function.run',
                        description: 'This is an awesome Lambda function!',
                        name       : 'my-awesome-function',
                        memory     : 128,
                        runtime    : "nodejs12.x",
                        vpc        : {},
                        versionLogicalId: 'AwesomeLambdaFunction123'
                    }
                }
            },
            cli: {
                log: msg => {}
            }
        };

        const connectorMock = sinon.mock( CloudfrontConnector.prototype );
        connectorMock.expects( 'updateDistributionConfig' ).never();

        const plugin = new CloudfrontPlugin( serverlessMock, {} );

        await plugin.deployFunctions();

        // Restore the original methods to avoid other tests from failing
        connectorMock.verify();
    } );

    it( 'Tests the configuration checks work.', async () => 
    {
        const serverlessMissingProvider = {
            service: {
                provider: {
                    region: 'us-east-1'
                },
                custom: {
                    cloudfront: {
                        distributionId: 'ABC1234DEF',
                        behaviors: {}
                    }
                }
            }
        };
        const plugin = new CloudfrontPlugin( serverlessMissingProvider, {} );

        try {
            await plugin.getConfiguration();
            assert.fail( 'This should have thrown an exception' );
        }
        catch( err ) {
            assert( true, 'Exception from the validation' );
        }

        const serverlessMissingCFConfig = {
            service: {
                provider: {
                    name: 'aws',
                    region: 'us-east-1'
                },
                custom: {
                    cloudfront: {}
                }
            }
        };
        const plugin2 = new CloudfrontPlugin( serverlessMissingCFConfig, {} );

        try {
            await plugin2.getConfiguration();
            assert.fail( 'This should have thrown an exception' );
        } 
        catch( err ) {
            assert( true, 'Exception from the validation' );
        } 
    } );
} );
