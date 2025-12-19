defmodule AuroraDsqlExample.MixProject do
  use Mix.Project

  def project do
    [
      app: :aurora_dsql_example,
      version: "0.1.0",
      elixir: "~> 1.14",
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  def application do
    [
      extra_applications: [:logger, :crypto, :public_key]
    ]
  end

  defp deps do
    [
      {:postgrex, "~> 0.19"}
    ]
  end
end
