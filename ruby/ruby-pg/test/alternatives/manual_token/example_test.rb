# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

require "rspec"
require_relative "../../../src/alternatives/manual_token/example"

RSpec.describe "manual_token example" do
  before(:all) do
    skip "CLUSTER_ENDPOINT required for integration test" unless ENV["CLUSTER_ENDPOINT"]
    skip "CLUSTER_USER required for integration test" unless ENV["CLUSTER_USER"]
    skip "REGION required for integration test" unless ENV["REGION"]
  end

  it "runs the manual token example without error" do
    expect { main }.not_to raise_error
  end
end
