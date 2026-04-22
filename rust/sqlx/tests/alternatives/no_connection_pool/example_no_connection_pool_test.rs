// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

use std::process::Command;

#[test]
fn test_no_connection_pool_example() {
    let output = Command::new("cargo")
        .args(["run", "--bin", "example_no_connection_pool"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Failed to run example_no_connection_pool");

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    assert!(
        output.status.success(),
        "example_no_connection_pool failed.\nstdout: {}\nstderr: {}",
        stdout,
        stderr
    );

    assert!(
        stdout.contains("Connection exercised successfully"),
        "Expected success message in stdout: {}",
        stdout
    );
}
