import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  GetCostAndUsageCommandInput,
  Granularity,
} from '@aws-sdk/client-cost-explorer';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { DatabaseService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { reduce } from 'lodash';
import moment from 'moment';
import { InfraWalletApi } from './InfraWalletApi';
import { CostQuery, Report } from './types';
import { getCategoryMappings, getCategoryByServiceName } from './functions';

export class AwsClient implements InfraWalletApi {
  static create(config: Config, database: DatabaseService) {
    return new AwsClient(config, database);
  }

  constructor(
    private readonly config: Config,
    private readonly database: DatabaseService,
  ) {}

  async fetchCostsFromCloud(query: CostQuery): Promise<Report[]> {
    const conf = this.config.getOptionalConfigArray(
      'backend.infraWallet.integrations.aws',
    );
    if (!conf) {
      return [];
    }

    const promises = [];
    const results: Report[] = [];
    const groupPairs = [];
    query.groups.split(',').forEach(group => {
      if (group.includes(':')) {
        const [type, name] = group.split(':');
        groupPairs.push({ type, name });
      }
    });

    for (const c of conf) {
      const name = c.getString('name');
      const accountId = c.getString('accountId');
      const assumedRoleName = c.getString('assumedRoleName');
      const accessKeyId = c.getOptionalString('accessKeyId');
      const accessKeySecret = c.getOptionalString('accessKeySecret');
      const tags = c.getOptionalStringArray('tags');
      const tagKeyValues: { [key: string]: string } = {};
      tags?.forEach(tag => {
        const [k, v] = tag.split(':');
        tagKeyValues[k.trim()] = v.trim();
      });
      const categoryMappings = await getCategoryMappings(this.database, 'aws');

      let stsParams = {};
      if (accessKeyId && accessKeySecret) {
        stsParams = {
          region: 'us-east-1',
          credentials: {
            accessKeyId: accessKeyId as string,
            secretAccessKey: accessKeySecret as string,
          },
        };
      } else {
        stsParams = {
          region: 'us-east-1',
        };
      }
      const promise = (async () => {
        const client = new STSClient(stsParams);
        const commandInput = {
          // AssumeRoleRequest
          RoleArn: `arn:aws:iam::${accountId}:role/${assumedRoleName}`,
          RoleSessionName: 'AssumeRoleSession1',
        };
        const assumeRoleCommand = new AssumeRoleCommand(commandInput);
        const assumeRoleResponse = await client.send(assumeRoleCommand);
        // init aws cost explorer client
        const awsCeClient = new CostExplorerClient({
          region: 'us-east-1',
          credentials: {
            accessKeyId: assumeRoleResponse.Credentials?.AccessKeyId as string,
            secretAccessKey: assumeRoleResponse.Credentials
              ?.SecretAccessKey as string,
            sessionToken: assumeRoleResponse.Credentials
              ?.SessionToken as string,
          },
        });

        // query this aws account's cost and usage using @aws-sdk/client-cost-explorer
        const input: GetCostAndUsageCommandInput = {
          TimePeriod: {
            Start: moment(parseInt(query.startTime, 10)).format('YYYY-MM-DD'),
            End: moment(parseInt(query.endTime, 10)).format('YYYY-MM-DD'),
          },
          Granularity: query.granularity.toUpperCase() as Granularity,
          Filter: { Dimensions: { Key: 'RECORD_TYPE', Values: ['Usage'] } },
          GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
          Metrics: ['UnblendedCost'],
        };
        
        const getCostCommand = new GetCostAndUsageCommand(input);
        const costAndusageResponse = await awsCeClient.send(getCostCommand);

        const transformedData = reduce(
          costAndusageResponse.ResultsByTime,
          (acc: { [key: string]: Report }, row) => {
            const rowTime = row.TimePeriod?.Start;
            const period = rowTime ? rowTime.substring(0, 7): 'unknown';
            if (row.Groups) {
              row.Groups.forEach(group => {
                const groupKeys = group.Keys ? group.Keys[0] : '';
                const keyName = `${name}_${groupKeys}`;
  
                if (!acc[keyName]) {
                  acc[keyName] = {
                    id: keyName,
                    name: name,
                    service: `${groupKeys} (AWS)`,
                    category: getCategoryByServiceName(
                      groupKeys,
                      categoryMappings,
                    ),
                    provider: 'AWS',
                    reports: {},
                    ...tagKeyValues,
                  };
                }

                const groupMetrics = group.Metrics;
                
                if (groupMetrics !== undefined) {
                  acc[keyName].reports[period] = parseFloat(
                    groupMetrics.UnblendedCost.Amount ?? '0.0',
                  );
                }
              });
            }

            return acc;
          },
          {},
        );

        Object.values(transformedData).map((value: any) => {
          results.push(value);
        });
      })();
      promises.push(promise);
    }
    await Promise.all(promises);
    return results;
  }
}
