# Query Editors: Using JupyterLab with Aurora DSQL

This guide provides step-by-step instructions on how to connect and query Amazon Aurora DSQL using JupyterLab with Python. JupyterLab is a popular interactive computing environment that combines code, text, and visualizations in a single document. It’s widely used for data science and research applications.

The instructions below will cover the basics of Aurora DSQL usage in both a local installation of JupyterLab as well as using Amazon SageMaker AI, a fully-managed machine learning service that provides a hosted environment with a UI for data workflows.

## Getting started

### Requirements

* An Aurora DSQL cluster
* AWS credentials configured (local installation only)
* Python version 3.10 or greater (local installation only)

### Using local JupyterLab

To get started with JupyterLab, users must first install the application using Python’s `pip`:

`pip install jupyterlab`

JupyterLab can then be opened by running `jupyter lab`. This will open the JupyterLab application at localhost:8888, accessible in a browser. Ensure you have AWS credentials configured in your local environment before proceeding.

### Using Amazon SageMaker AI

In the AWS console, proceed to the Amazon SageMaker AI console page and then to the ‘Notebooks’ section under ‘Applications and IDEs’. From there you can select ‘Create notebook instance’ to begin creating a SageMaker environment. Select an instance type and platform before clicking ‘Create notebook instance’.

See [Amazon SageMaker AI setup documentation](https://docs.aws.amazon.com/sagemaker/latest/dg/gs-setup-working-env.html) for more information on setup and instance options.

**Warning: Using Amazon SageMaker AI may result in charges to your AWS account.**

Once the SageMaker instance becomes active, you can open it from the ‘Notebook instances’ section with ‘Open JupyterLab’ . Before getting started with Aurora DSQL in your notebook you must provide access to your DSQL cluster in the SageMaker instance’s IAM role. The simplest way to do so is to follow the link to the IAM role in the notebook instance page. From there you can edit the Policies attached to your SageMaker IAM role. See [Authentication and authorization](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/authentication-authorization.html) for more information on configuring an IAM policy to allow access to Aurora DSQL.

### Connecting to Aurora DSQL using JupyterLab

Once you’ve set up a JupyterLab instance, the steps to connect to Aurora DSQL are the same locally and in SageMaker AI. Create a notebook using the new file button on the left, then select Python 3 under Notebook. From here you will now have an empty notebook, in which you can add cells with Python code.

To connect to Aurora DSQL, first install the [Aurora DSQL Connector for Python](https://github.com/awslabs/aurora-dsql-python-connector) and the Psycopg2 driver in a Python cell, and then import it:

```
pip install aurora_dsql_python_connector psycopg2
```

```
import aurora_dsql_psycopg2 as dsql
```

With the connector imported, you can then create a DSQL configuration and connect. The Aurora DSQL Python Connector will automatically handle creation of an authentication token on each connection.

```
config = {
    'host': "your-cluster.dsql.us-east-1.on.aws",
    'region': "us-east-1",
    'user': "admin",
    'sslmode': 'verify-full',
    'sslrootcert': './root.pem'
}

conn = dsql.connect(**config)
```

Upon running your code you should now have a Psycopg2 connection to Aurora DSQL. You can then run queries using the Psycopg2 cursor and providing your SQL query. See the [Psycopg2 documentation](https://www.psycopg.org/docs/index.html) for more information on using Psycopg2 with a Postgres-compatible database. This query will result in a list of tuples in `results_list`.

```
with conn:
   with conn.cursor() as cur:
        cur.execute("SELECT * FROM table")
        results_list = cur.fetchall()
```

You can then use Python frameworks like [Pandas](https://pandas.pydata.org/) to analyze or visualize your query results, for example:

```
pip install pandas

import pandas as pd

df = pd.DataFrame(results_list)
print(df)
print(f"Total records: {len(df)}")
```

## Further reading

[Amazon SageMaker AI setup documentation](https://docs.aws.amazon.com/sagemaker/latest/dg/gs-setup-working-env.html)

[Aurora DSQL Connector for Python](https://github.com/awslabs/aurora-dsql-python-connector)

[Pandas documentation](https://pandas.pydata.org/docs/user_guide/index.html)
