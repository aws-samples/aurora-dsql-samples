import { AxdbFrontendSigner } from "@aws-sdk/axdbfrontend-signer";

async function generateToken(endpoint, action, region, expiresIn) {
  const signer = new AxdbFrontendSigner({
      hostname: endpoint,
      action,
      region,
      expiresIn
  });
  try {
      const token = await signer.getAuthToken();
      return token;
  } catch (error) {
      console.error("Failed to generate token: ", error);
      throw error;
  }
}

export { generateToken }
