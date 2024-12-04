package org.example;

import org.junit.jupiter.api.*;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dsql.DsqlClient;
import software.amazon.awssdk.services.dsql.model.*;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.example.CreateCluster.createCluster;
import static org.example.CreateMultiRegionCluster.createMultiRegionCluster;
import static org.example.DeleteCluster.deleteCluster;
import static org.example.DeleteMultiRegionClusters.deleteMultiRegionClusters;
import static org.example.GetCluster.getCluster;
import static org.example.UpdateCluster.updateCluster;

public class DsqlClusterManagementTest {

    private static final Region REGION = Region.US_EAST_1;

    private DsqlClient client;

    @BeforeEach
    void setup() {
        client = ConnectionUtil.createClient(REGION);
    }

    @AfterEach
    void teardown() {
        client.close();
    }

    @Test
    public void testCreateDeleteCluster() throws Exception {
        String clusterId = createCluster(client, false, new HashMap<>());
        DeleteClusterResponse response = deleteCluster(clusterId, client);
        Assertions.assertEquals(ClusterStatus.DELETING, response.status());
        Assertions.assertEquals(clusterId, response.identifier());
    }

    @Test
    public void testGetCluster() throws Exception {
        String clusterId = createCluster(client, false, new HashMap<>());
        try {
            GetClusterResponse response = getCluster(clusterId, client);
            Assertions.assertNotNull(response);
            Assertions.assertNotNull(response.status());
            Assertions.assertEquals(clusterId, response.identifier());
        } finally {
            deleteCluster(clusterId, client);
        }
    }

    @Test
    public void testUpdateCluster() throws Exception {
        String clusterId = createCluster(client, true, new HashMap<>());
        try {
            boolean deletionProtectionEnabled = false;
            UpdateClusterResponse response = updateCluster(clusterId, deletionProtectionEnabled, client);
            Assertions.assertEquals(clusterId, response.identifier());
            Assertions.assertEquals(ClusterStatus.UPDATING, response.status());
        } finally {
            deleteCluster(clusterId, client);
        }
    }

    @Test
    public void testMultiRegionCluster() throws Exception {
        List<String> linkedRegionList = Arrays.asList(REGION.toString(), "us-east-2");
        String witnessRegion = "us-west-2";
        Map<String, LinkedClusterProperties> clusterProperties = new HashMap<String, LinkedClusterProperties>() {{
            put("us-east-1", LinkedClusterProperties.builder()
                    .tags(new HashMap<String, String>() {{
                        put("Name", "Foo");
                    }})
                    .deletionProtectionEnabled(false)
                    .build());
            put("us-east-2", LinkedClusterProperties.builder()
                    .tags(new HashMap<String, String>() {{
                        put("Name", "Bar");
                    }})
                    .deletionProtectionEnabled(false)
                    .build());
        }};
        List<String> linkedClusterArns = createMultiRegionCluster(client, linkedRegionList, witnessRegion, clusterProperties);
        Assertions.assertEquals(2, linkedClusterArns.size());
        deleteMultiRegionClusters(linkedClusterArns, client);
    }
}
