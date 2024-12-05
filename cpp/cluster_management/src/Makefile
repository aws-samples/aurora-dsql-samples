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


linux: Example.cpp
	g++ ./*.cpp -o example $(INC_DIR) $(LIB_DIR) $(LIBS)  

mac: Example.cpp
	g++  -std=c++11 ./*.cpp -o example $(INC_DIR_MAC) $(LIB_DIR_MAC) $(LIBS)  

clean:
	rm -f example
