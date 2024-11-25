#----------------------------------------------------------------
# Generated CMake target import file for configuration "Release".
#----------------------------------------------------------------

# Commands may need to know the format version.
set(CMAKE_IMPORT_FILE_VERSION 1)

# Import target "AWS::aws-c-http" for configuration "Release"
set_property(TARGET AWS::aws-c-http APPEND PROPERTY IMPORTED_CONFIGURATIONS RELEASE)
set_target_properties(AWS::aws-c-http PROPERTIES
  IMPORTED_IMPLIB_RELEASE "${_IMPORT_PREFIX}/lib/aws-c-http.lib"
  IMPORTED_LOCATION_RELEASE "${_IMPORT_PREFIX}/bin/aws-c-http.dll"
  )

list(APPEND _cmake_import_check_targets AWS::aws-c-http )
list(APPEND _cmake_import_check_files_for_AWS::aws-c-http "${_IMPORT_PREFIX}/lib/aws-c-http.lib" "${_IMPORT_PREFIX}/bin/aws-c-http.dll" )

# Commands beyond this point should not need to know the version.
set(CMAKE_IMPORT_FILE_VERSION)
