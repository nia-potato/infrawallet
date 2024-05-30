export interface Config {
  backend: {
    infraWallet: {
      /**
       * @deepVisibility secret
       */
      integrations: {
        azure?: [
          {
            name: string;
            subscriptionId: string;
            clientId: string;
            tenantId: string;
            clientSecret: string;
            tags?: string[];
          },
        ];
        aws?: [
          {
            name: string;
            accountId: string;
            assumedRoleName: string;
            accessKeyId: string;
            accessKeySecret: string;
            tags?: string[];
          },
        ];
      };
    };
  };
}
