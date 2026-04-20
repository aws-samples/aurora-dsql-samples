# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

require "rspec"
require_relative "../../../src/alternatives/manual_token/example"

RSpec.describe "manual_token example" do
  before(:all) do
    raise "CLUSTER_ENDPOINT is required" unless ENV["CLUSTER_ENDPOINT"]
    raise "CLUSTER_USER is required" unless ENV["CLUSTER_USER"]
    raise "REGION is required" unless ENV["REGION"]
  end

  it "runs the manual token example without error" do
    expect { main }.not_to raise_error
  end
end
