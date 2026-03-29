# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

require "rspec"
require_relative "../src/example_preferred"

RSpec.describe "example_preferred" do
  before(:all) do
    raise "CLUSTER_ENDPOINT is required" unless ENV["CLUSTER_ENDPOINT"]
  end

  it "runs the preferred example without error" do
    expect { example }.not_to raise_error
  end
end
