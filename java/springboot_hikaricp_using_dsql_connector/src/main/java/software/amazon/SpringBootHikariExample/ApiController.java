/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package software.amazon.SpringBootHikariExample;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
public class ApiController {

  @Autowired
  private JdbcTemplate jdbcTemplate;

  @GetMapping(value = "/select1")
  public Integer getOne() {
    if (jdbcTemplate == null) {
      throw new RuntimeException("JdbcTemplate is not initialized");
    }
    return jdbcTemplate.queryForObject("SELECT 1", Integer.class);
  }

  @GetMapping(value = "/database-info")
  public Map<String, Object> getDatabaseInfo() {
    if (jdbcTemplate == null) {
      throw new RuntimeException("JdbcTemplate is not initialized");
    }
    return jdbcTemplate.queryForMap(
      "SELECT current_user as user, current_database() as database, version() as version"
    );
  }

  @GetMapping(value = "/current-time")
  public Map<String, Object> getCurrentTime() {
    if (jdbcTemplate == null) {
      throw new RuntimeException("JdbcTemplate is not initialized");
    }
    return jdbcTemplate.queryForMap("SELECT current_timestamp as current_time");
  }

  @GetMapping(value = "/health")
  public Map<String, Object> getHealth() {
    if (jdbcTemplate == null) {
      throw new RuntimeException("JdbcTemplate is not initialized");
    }
    return jdbcTemplate.queryForMap("SELECT 'Aurora DSQL Connection OK' as status, current_timestamp as timestamp");
  }
}
