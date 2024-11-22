#----------------------------------------------------------------
# Generated CMake target import file for configuration "Release".
#----------------------------------------------------------------

# Commands may need to know the format version.
set(CMAKE_IMPORT_FILE_VERSION 1)

# Import target "testing-resources" for configuration "Release"
set_property(TARGET testing-resources APPEND PROPERTY IMPORTED_CONFIGURATIONS RELEASE)
set_target_properties(testing-resources PROPERTIES
  IMPORTED_LOCATION_RELEASE "${_IMPORT_PREFIX}/lib/libtesting-resources.dylib"
  IMPORTED_SONAME_RELEASE "@rpath/libtesting-resources.dylib"
  )

list(APPEND _cmake_import_check_targets testing-resources )
list(APPEND _cmake_import_check_files_for_testing-resources "${_IMPORT_PREFIX}/lib/libtesting-resources.dylib" )

# Commands beyond this point should not need to know the version.
set(CMAKE_IMPORT_FILE_VERSION)
