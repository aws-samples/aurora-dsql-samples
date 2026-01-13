/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package dsql

import (
	"fmt"
	"regexp"
	"strings"
)

const (
	preRegionHostPattern  = ".dsql."
	postRegionHostPattern = ".on.aws"
)

var regionPattern = regexp.MustCompile(`\.dsql[^.]*\.([^.]+)\.on\.aws$`)

// clusterIDPattern validates DSQL cluster IDs: 26 lowercase alphanumeric characters
var clusterIDPattern = regexp.MustCompile(`^[a-z0-9]{26}$`)

// ParseRegion extracts the AWS region from a DSQL hostname.
// Returns an error if the hostname is empty or doesn't match the expected pattern.
func ParseRegion(host string) (string, error) {
	if host == "" {
		return "", fmt.Errorf("hostname is required to parse region")
	}

	match := regionPattern.FindStringSubmatch(host)
	if match == nil {
		return "", fmt.Errorf("unable to parse region from hostname: '%s'", host)
	}

	return match[1], nil
}

// BuildHostname constructs a full DSQL hostname from a cluster ID and region.
func BuildHostname(clusterID, region string) string {
	return clusterID + preRegionHostPattern + region + postRegionHostPattern
}

// IsClusterID returns true if the host is a cluster ID rather than a full hostname.
func IsClusterID(host string) bool {
	if host == "" || strings.Contains(host, ".") {
		return false
	}
	return clusterIDPattern.MatchString(host)
}
