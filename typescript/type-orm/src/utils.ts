export const getEnvironmentVariables = () => {
  const user = process.env.CLUSTER_USER;
  const clusterEndpoint = process.env.CLUSTER_ENDPOINT;
  const region = process.env.REGION;

  if (!clusterEndpoint || !region || !user) {
    throw new Error(
      `Missing required environment variables: ${[
        !user && "CLUSTER_USER",
        !clusterEndpoint && "CLUSTER_ENDPOINT",
        !region && "REGION",
      ]
        .filter(Boolean)
        .join(", ")}`
    );
  }

  return { user, clusterEndpoint, region };
};
