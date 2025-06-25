import {App, aws_dsql, Stack, Duration} from 'aws-cdk-lib';
import {Code, Function, Runtime} from 'aws-cdk-lib/aws-lambda';
import {Effect, PolicyStatement} from "aws-cdk-lib/aws-iam";

const app = new App();

const region = process.env.CLUSTER_REGION || 'us-east-1';

class DsqlLambdaStack extends Stack {
    constructor(scope, id, props) {
        super(scope, id, props);

        const dsqlCluster = new aws_dsql.CfnCluster(this, 'DsqlCluster', {
            deletionProtectionEnabled: false,
            tags: [{
                key: 'Name', value: 'Lambda single region cluster',
            }, {
                key: 'Repo', value: 'aws-samples/aurora-dsql-samples',
            }],
        });

        // Define the Lambda function
        const dsqlFunction = new Function(this, 'DsqlLambdaSample', {
            functionName: 'DsqlLambdaSample',
            runtime: Runtime.NODEJS_22_X,
            handler: 'lambda.handler',
            code: Code.fromAsset('sample'),
            timeout: Duration.seconds(30),
            memorySize: 256,
            environment: {
                CLUSTER_ENDPOINT: `${dsqlCluster.attrIdentifier}.dsql.${region}.on.aws`,
                CLUSTER_REGION: region
            }
        });

        // Add DSQL permissions to the Lambda function
        dsqlFunction.addToRolePolicy(new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ['dsql:DbConnectAdmin', 'dsql:DbConnect'],
            resources: [dsqlCluster.attrResourceArn]
        }));
    }
}

new DsqlLambdaStack(app, "DsqlSample", {
    env: {
        region: region
    }
})
