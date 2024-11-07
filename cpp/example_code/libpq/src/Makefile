#
# Makefile for libpq samples
#

PG_INC_DIR=-I /usr/local/pgsql/include
AWS_INC_DIR=-I ../sdk/include

LIBPQ_DIR=-L /usr/local/pgsql/lib
AWS_LIB_DIR=-L ../sdk/lib

INC_DIR=$(PG_INC_DIR) $(AWS_INC_DIR) 
LIB_DIR=$(LIBPQ_DIR) $(AWS_LIB_DIR)
LIBS=-lpq -laws-cpp-sdk-axdbfrontend -laws-cpp-sdk-core 

libpq_example: libpq_example.cpp
	g++ libpq_example.cpp -o libpq_example $(INC_DIR) $(LIB_DIR) $(LIBS) 

clean:
	rm -f libpq_example
