# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

require "rspec"
require_relative "../src/example_preferred"

RSpec.describe "example_preferred" do
  before(:all) do
    skip "CLUSTER_ENDPOINT required for integration test" unless ENV["CLUSTER_ENDPOINT"]
  end

  it "runs the preferred example without error" do
    expect { example }.not_to raise_error
  end
end
