# Build all cluster management examples
# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GOCLEAN=$(GOCMD) clean
BINARY_DIR=bin
TEST_FLAGS=-v -count=1

# Find all cmd directories
CMD_DIRS := $(notdir $(wildcard cmd/*))
BINARIES := $(addprefix $(BINARY_DIR)/,$(CMD_DIRS))

# Default target
.PHONY: all
all: clean build

.PHONY: test
test: test-all

# Test all commands
.PHONY: test-all
test-all: $(addprefix test-,$(CMD_DIRS))

# Rule to test each command individually
.PHONY: test-%
test-%:
	$(GOCMD) test $(TEST_FLAGS) ./cmd/$*

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

# List all commands
.PHONY: list
list:
	@echo "Available commands:"
	@echo $(CMD_DIRS) | tr ' ' '\n'
