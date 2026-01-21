declare module "nodemailer" {
  type Transporter = {
    sendMail: (...args: any[]) => Promise<unknown>;
    verify: () => Promise<void>;
  };

  const nodemailer: {
    default: {
      createTransport: (...args: any[]) => Transporter;
    };
    createTransport: (...args: any[]) => Transporter;
  };
  export default nodemailer;
}

declare module "@uni-status/licensing" {
  export const KEYGEN_ACCOUNT_ID: string;
  export const KEYGEN_API_URL: string;
  export const KEYGEN_PUBLIC_KEY_BASE64: string;
  export const KEYGEN_PUBLIC_KEY_PEM: string;
  export const KEYGEN_PORTAL_URL: string;
  export const PRICING_URL: string;
  export const KEYGEN_POLICY_IDS: {
    PRO: string;
    ENTERPRISE: string;
  };
  export function getSelfHostedKeygenConfig(): {
    accountId: string;
    apiUrl: string;
    publicKey: string;
    portalUrl: string;
    pricingUrl: string;
    policyIds: {
      PRO: string;
      ENTERPRISE: string;
    };
  };
}

declare module "@uni-status/enterprise/shared/roles-extended" {
  export function isExtendedRole(roleId: string): boolean;
}
