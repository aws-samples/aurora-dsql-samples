defmodule AuroraDsqlExample do
  @moduledoc """
  Example demonstrating Aurora DSQL connectivity with Elixir using Postgrex.
  """

  def run do
    cluster_endpoint = System.get_env("CLUSTER_ENDPOINT") || raise "CLUSTER_ENDPOINT not set"
    cluster_user = System.get_env("CLUSTER_USER") || raise "CLUSTER_USER not set"
    region = System.get_env("REGION") || raise "REGION not set"

    token = generate_auth_token(cluster_endpoint, cluster_user, region)
    schema = if cluster_user == "admin", do: "public", else: "myschema"

    opts = [
      hostname: cluster_endpoint,
      port: 5432,
      username: cluster_user,
      password: token,
      database: "postgres",
      ssl: true,
      ssl_opts: [
        verify: :verify_peer,
        cacerts: :public_key.cacerts_get(),
        customize_hostname_check: [
          match_fun: :public_key.pkix_verify_hostname_match_fun(:https)
        ]
      ]
    ]

    {:ok, conn} = Postgrex.start_link(opts)

    try do
      Postgrex.query!(conn, "SET search_path = #{schema}", [])
      exercise_connection(conn)
      IO.puts("Connection exercised successfully")
    after
      GenServer.stop(conn)
    end
  end

  defp generate_auth_token(endpoint, user, region) do
    action = if user == "admin", do: "generate-db-connect-admin-auth-token", else: "generate-db-connect-auth-token"
    
    {output, 0} = System.cmd("aws", [
      "dsql",
      action,
      "--hostname", endpoint,
      "--region", region
    ])
    
    String.trim(output)
  end

  defp exercise_connection(conn) do
    Postgrex.query!(conn, """
      CREATE TABLE IF NOT EXISTS owner (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        name VARCHAR(30) NOT NULL,
        city VARCHAR(80) NOT NULL,
        telephone VARCHAR(20) DEFAULT NULL,
        PRIMARY KEY (id)
      )
    """, [])

    Postgrex.query!(conn, 
      "INSERT INTO owner (name, city, telephone) VALUES ($1, $2, $3)",
      ["John Doe", "Anytown", "555-555-1999"]
    )

    result = Postgrex.query!(conn, 
      "SELECT * FROM owner WHERE name = $1",
      ["John Doe"]
    )

    [row] = result.rows
    [_id, name, city, telephone] = row
    
    unless name == "John Doe" and city == "Anytown" and telephone == "555-555-1999" do
      raise "Unexpected data retrieved"
    end

    Postgrex.query!(conn, "DELETE FROM owner WHERE name = $1", ["John Doe"])
  end
end
