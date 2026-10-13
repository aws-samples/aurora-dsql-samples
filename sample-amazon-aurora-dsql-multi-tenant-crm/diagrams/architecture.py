#!/usr/bin/env python3
"""Architecture diagram for the multi-tenant CRM on Amazon Aurora DSQL.

Rendered with the `diagrams` library (https://diagrams.mingrammer.com), which
uses the official AWS icon set, so the diagram is reproducible and regenerates
whenever the architecture changes.

Flow shown:
    Tenant clients ──HTTPS──▶ Amazon ECS Express Mode (ALB ▸ AWS Fargate)
                              │  assumes ECS task role (dsql:DbConnect)
                              │  generates a short-lived IAM auth token
                              ▼
                          Amazon Aurora DSQL  (pooled: shared schema, tenant_id per row)
    AWS IAM validates the token on the connection (no database password).

Regenerate (Graphviz `dot` must be on PATH):

    python3 -m venv .diagrams-venv
    ./.diagrams-venv/bin/pip install diagrams
    # macOS:  brew install graphviz      Debian/Ubuntu: sudo apt-get install graphviz
    ./.diagrams-venv/bin/python diagrams/architecture.py

Output: diagrams/architecture.png
"""
from diagrams import Diagram, Cluster, Edge
from diagrams.aws.compute import Fargate
from diagrams.aws.database import AuroraInstance
from diagrams.aws.security import IAM, IAMRole
from diagrams.aws.network import ElbApplicationLoadBalancer
from diagrams.aws.general import Users

graph_attr = {
    "fontsize": "18",
    "labelloc": "t",
    "pad": "0.5",
    "splines": "spline",
    "nodesep": "0.8",
    "ranksep": "1.0",
}

with Diagram(
    "Multi-tenant CRM on Amazon Aurora DSQL",
    filename="diagrams/architecture",
    show=False,
    direction="LR",
    graph_attr=graph_attr,
):
    clients = Users("Tenant clients\n(X-Tenant-Id)")

    with Cluster("AWS Cloud"):
        with Cluster("Amazon ECS Express Mode (AWS Fargate)"):
            alb = ElbApplicationLoadBalancer("Application\nLoad Balancer\n(HTTPS)")
            app = Fargate(
                "Express.js CRM API\n(tenant-scoped repositories,\nOCC retry on 40001)"
            )
            alb >> Edge(label="→ :3000") >> app

        task_role = IAMRole("ECS task role\n(dsql:DbConnect)")
        iam = IAM("AWS IAM")
        dsql = AuroraInstance(
            "Amazon Aurora DSQL\n(pooled: shared schema,\ntenant_id per row)"
        )

        # IAM authentication of the connection (no password anywhere).
        app >> Edge(label="assumes") >> task_role
        task_role >> Edge(label="signs\nIAM auth token") >> iam
        iam >> Edge(label="validates token", style="dashed") >> dsql

        # The actual data connection, authenticated by that IAM token over TLS.
        app >> Edge(label="IAM-authenticated SQL (TLS)") >> dsql

    clients >> Edge(label="HTTPS") >> alb
