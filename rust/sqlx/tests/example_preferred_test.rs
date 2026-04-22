// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

use std::process::Command;

#[test]
fn test_example_preferred() {
    let output = Command::new("cargo")
        .args(["run", "--bin", "example_preferred"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Failed to run example_preferred");

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    assert!(
        output.status.success(),
        "example_preferred failed.\nstdout: {}\nstderr: {}",
        stdout,
        stderr
    );

    assert!(
        stdout.contains("Concurrent pool operations completed successfully"),
        "Expected success message in stdout: {}",
        stdout
    );

    assert!(
        stdout.contains("Transactional write completed successfully"),
        "Expected transactional write message in stdout: {}",
        stdout
    );
}
