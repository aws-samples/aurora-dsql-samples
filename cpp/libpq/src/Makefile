#
# Makefile for libpq samples
#

# Common 
AWS_INC_DIR=-I ../aws-sdk-install/include
AWS_LIB_DIR=-L ../aws-sdk-install/lib

LIBS=-lpq -laws-cpp-sdk-dsql -laws-cpp-sdk-core 

# Linux
PG_INC_DIR=-I /usr/local/pgsql/include
LIBPQ_DIR=-L /usr/local/pgsql/lib

INC_DIR=$(PG_INC_DIR) $(AWS_INC_DIR) 
LIB_DIR=$(LIBPQ_DIR) $(AWS_LIB_DIR)

# Ubuntu
PG_INC_DIR_UBUNTU=-I /usr/include/postgresql
LIBPQ_DIR_UBUNTU=-L /lib/x86_64-linux-gnu/

INC_DIR_UBUNTU=$(PG_INC_DIR_UBUNTU) $(AWS_INC_DIR) 
LIB_DIR_UBUNTU=$(LIBPQ_DIR_UBUNTU) $(AWS_LIB_DIR)

# Mac 
COMPILER_INC_DIR_MAC=-I /Library/Developer/CommandLineTools/SDKs/MacOSX14.5.sdk/usr/include/c++/v1
PG_INC_DIR_MAC=-I /usr/local/opt/libpq/include
LIBPQ_DIR_MAC=-L /usr/local/opt/libpq/lib

INC_DIR_MAC=$(COMPILER_INC_DIR_MAC) $(PG_INC_DIR_MAC) $(AWS_INC_DIR)
LIB_DIR_MAC=$(LIBPQ_DIR_MAC) $(AWS_LIB_DIR)


libpq_example: libpq_example.cpp
	g++ libpq_example.cpp -o libpq_example $(INC_DIR) $(LIB_DIR) $(LIBS) 

libpq_example_ubuntu: libpq_example.cpp
	g++ libpq_example.cpp -o libpq_example $(INC_DIR_UBUNTU) $(LIB_DIR_UBUNTU) $(LIBS) 

libpq_example_mac: libpq_example.cpp
	g++  -std=c++11 libpq_example.cpp -o libpq_example $(INC_DIR_MAC) $(LIB_DIR_MAC) $(LIBS) 

clean:
	rm -f libpq_example


# ********************
# Windows 

# Uncomment the section below to build on Windows

# PG_INC_DIR_WIN_64=/I "C:\Program Files\PostgreSQL\16\include"
# AWS_INC_DIR=/I ..\aws-sdk-install\include
# INC_DIR_WIN_x64= $(PG_INC_DIR_WIN_64) $(AWS_INC_DIR)

# AWS_LIB_DIR_WIN_x64=..\aws-sdk-install\lib\bin
# LIBPQ_DIR_WIN_x64="C:\Program Files\PostgreSQL\16\lib"

# LIBS_WIN_x64=$(AWS_LIB_DIR_WIN_x64)\aws-cpp-sdk-dsql.lib  $(AWS_LIB_DIR_WIN_x64)\aws-cpp-sdk-core.lib $(LIBPQ_DIR_WIN_x64)\libpq.lib

# TARGET = libpq_example.exe


# windows_x64: $(TARGET)

# $(TARGET):libpq_example.cpp
#     cl libpq_example.cpp $(INC_DIR_WIN_x64) $(LIBS_WIN_x64)


# windows_clean:
#   del *.obj; del *.exe