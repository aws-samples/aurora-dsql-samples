#
# Makefile for libpq samples
#

# Common 
AWS_INC_DIR=-I ../sdk/include

LIBS=-lpq -laws-cpp-sdk-dsql -laws-cpp-sdk-core 

# Linux
PG_INC_DIR=-I /usr/local/pgsql/include

LIBPQ_DIR=-L /usr/local/pgsql/lib
AWS_LIB_DIR=-L ../sdk/lib

INC_DIR=$(PG_INC_DIR) $(AWS_INC_DIR) 
LIB_DIR=$(LIBPQ_DIR) $(AWS_LIB_DIR)

# Mac x64
PG_INC_DIR_MAC=-I /usr/local/opt/libpq/include
COMPILER_INC_DIR_MAC=-I /Library/Developer/CommandLineTools/SDKs/MacOSX14.5.sdk/usr/include/c++/v1

LIBPQ_DIR_MAC=-L /usr/local/opt/libpq/lib
AWS_LIB_DIR_MAC_x64=-L ../sdk/mac_x64_lib

INC_DIR_MAC=$(COMPILER_INC_DIR_MAC) $(PG_INC_DIR_MAC) $(AWS_INC_DIR)
LIB_DIR_MAC=$(LIBPQ_DIR_MAC) $(AWS_LIB_DIR_MAC_x64)


libpq_example: libpq_example.cpp
	g++ libpq_example.cpp -o libpq_example $(INC_DIR) $(LIB_DIR) $(LIBS) 

mac_x64: libpq_example.cpp
	g++  -std=c++11 libpq_example.cpp -o libpq_example $(INC_DIR_MAC) $(LIB_DIR_MAC) $(LIBS) 

clean:
	rm -f libpq_example


# ********************
# Windows 

PG_INC_DIR_WIN_64=/I "C:\Program Files\PostgreSQL\16\include"
AWS_INC_DIR=/I ..\sdk\include
INC_DIR_WIN_x64= $(PG_INC_DIR_WIN_64) $(AWS_INC_DIR)

AWS_LIB_DIR_WIN_x64=..\sdk\win_x64_lib\bin
LIBPQ_DIR_WIN_x64="C:\Program Files\PostgreSQL\16\lib"

LIBS_WIN_x64=$(AWS_LIB_DIR_WIN_x64)\aws-cpp-sdk-dsql.lib  $(AWS_LIB_DIR_WIN_x64)\aws-cpp-sdk-core.lib $(LIBPQ_DIR_WIN_x64)\libpq.lib

TARGET = libpq_example.exe


windows_x64: $(TARGET)

$(TARGET):libpq_example.cpp
    cl libpq_example.cpp $(INC_DIR_WIN_x64) $(LIBS_WIN_x64)


windows_clean:
  del *.obj; del *.exe