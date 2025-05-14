# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GOCLEAN=$(GOCMD) clean
BINARY_DIR=bin

# Find all cmd directories
CMD_DIRS := $(wildcard cmd/*)
BINARIES := $(patsubst cmd/%,$(BINARY_DIR)/%,$(CMD_DIRS))

# Default target
.PHONY: all
all: clean build

# Create bin directory
$(BINARY_DIR):
	mkdir -p $(BINARY_DIR)

# Build all commands
.PHONY: build
build: $(BINARY_DIR) $(BINARIES)

# Rule to build each binary
$(BINARY_DIR)/%: cmd/%
	$(GOBUILD) -o $@ ./cmd/$*

# Clean build artifacts
.PHONY: clean
clean:
	$(GOCLEAN)
	rm -rf $(BINARY_DIR)

# Build specific commands
.PHONY: $(CMD_DIRS)
$(CMD_DIRS): cmd/%: $(BINARY_DIR)/%
