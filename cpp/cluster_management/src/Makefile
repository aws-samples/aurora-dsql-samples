#
# Makefile for cluster management samples
#

# Common 
AWS_INC_DIR=-I ../aws-sdk-install/include
AWS_LIB_DIR=-L ../aws-sdk-install/lib
LIBS=-laws-cpp-sdk-dsql -laws-cpp-sdk-core 

# Linux
INC_DIR=$(AWS_INC_DIR) 
LIB_DIR=$(AWS_LIB_DIR)

# Mac
COMPILER_INC_DIR_MAC=-I /Library/Developer/CommandLineTools/SDKs/MacOSX14.5.sdk/usr/include/c++/v1

INC_DIR_MAC=$(COMPILER_INC_DIR_MAC) $(AWS_INC_DIR)
LIB_DIR_MAC=$(AWS_LIB_DIR)


# Linux
linux_create_multi: CreateMultiRegion.cpp
	g++  -std=c++11 ./CreateMultiRegion.cpp -o create_multi_region_clusters $(INC_DIR) $(LIB_DIR) $(LIBS) 

linux_delete_multi: DeleteMultiRegion.cpp
	g++  -std=c++11 ./DeleteMultiRegion.cpp -o delete_multi_region_clusters $(INC_DIR) $(LIB_DIR) $(LIBS) 

linux_create_single: CreateSingleRegion.cpp
	g++  -std=c++11 ./CreateSingleRegion.cpp -o create_single_region_cluster $(INC_DIR) $(LIB_DIR) $(LIBS)

linux_delete_single: DeleteSingleRegion.cpp
	g++  -std=c++11 ./DeleteSingleRegion.cpp -o delete_single_region_cluster $(INC_DIR) $(LIB_DIR) $(LIBS) 

linux_update: UpdateCluster.cpp
	g++  -std=c++11 ./UpdateCluster.cpp -o update_cluster $(INC_DIR) $(LIB_DIR) $(LIBS)   

linux_get: GetCluster.cpp
	g++  -std=c++11 ./GetCluster.cpp -o get_cluster $(INC_DIR) $(LIB_DIR) $(LIBS)   

linux_all: linux_create_multi linux_delete_multi linux_create_single linux_delete_single linux_update linux_get

linux_example: Example.cpp
	g++ ./*.cpp -o example $(INC_DIR) $(LIB_DIR) $(LIBS)  

# Mac 
mac_create_multi: CreateMultiRegion.cpp
	g++  -std=c++11 ./CreateMultiRegion.cpp -o create_multi_region_clusters $(INC_DIR_MAC) $(LIB_DIR_MAC) $(LIBS) 

mac_delete_multi: DeleteMultiRegion.cpp
	g++  -std=c++11 ./DeleteMultiRegion.cpp -o delete_multi_region_clusters $(INC_DIR_MAC) $(LIB_DIR_MAC) $(LIBS) 

mac_create_single: CreateSingleRegion.cpp
	g++  -std=c++11 ./CreateSingleRegion.cpp -o create_single_region_cluster $(INC_DIR_MAC) $(LIB_DIR_MAC) $(LIBS)

mac_delete_single: DeleteSingleRegion.cpp
	g++  -std=c++11 ./DeleteSingleRegion.cpp -o delete_single_region_cluster $(INC_DIR_MAC) $(LIB_DIR_MAC) $(LIBS) 

mac_update: UpdateCluster.cpp
	g++  -std=c++11 ./UpdateCluster.cpp -o update_cluster $(INC_DIR_MAC) $(LIB_DIR_MAC) $(LIBS)   

mac_get: GetCluster.cpp
	g++  -std=c++11 ./GetCluster.cpp -o get_cluster $(INC_DIR_MAC) $(LIB_DIR_MAC) $(LIBS)   

mac_all: mac_create_multi mac_delete_multi mac_create_single mac_delete_single mac_update mac_get 

mac_example: Example.cpp
	g++  -std=c++11 ./*.cpp -o example $(INC_DIR_MAC) $(LIB_DIR_MAC) $(LIBS)  

# clean up
clean:
	rm -f create_multi_region_clusters
	rm -f delete_multi_region_clusters
	rm -f create_single_region_cluster
	rm -f delete_single_region_cluster
	rm -f update_cluster
	rm -f get_cluster
	rm -f example
	
