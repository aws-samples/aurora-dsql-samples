/*
 * Copyright 2024 Amazon.com, Inc. or its affiliates.
 * Licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
 
 package com.amazon.dsql.devtools;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.services.axdbfrontend.AxdbFrontendUtilities;
import software.amazon.awssdk.services.axdbfrontend.model.Action;
import software.amazon.awssdk.regions.Region;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.Duration;
import java.util.Properties;

public class ConnectionUtil {

    public static final String ADMIN = "admin";
    public static final String OPTIONS = "options";

    public static Connection getConnection(String cluster, String region) throws SQLException {

        Properties props = new Properties();

        String url = "jdbc:postgresql://" + cluster + ":5432/postgres";
        props.setProperty("user", ADMIN);
        props.setProperty("password", getPassword(cluster, region));
        // TBD: need to remove pooler from code when pooler becomes the default
        props.setProperty(OPTIONS, "axdb_opts=pooler=true");
        return DriverManager.getConnection(url,
                props);

    }

    private static String getPassword(String host, String regionName) {
        Action action = Action.DB_CONNECT_SUPERUSER;

        AxdbFrontendUtilities utilities = AxdbFrontendUtilities.builder()
                .region(Region.of(regionName))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();

        return utilities.generateAuthenticationToken(builder -> builder.hostname(host)
                .action(action)
                .region(Region.of(regionName)));
    }
}
