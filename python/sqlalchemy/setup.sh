#!/bin/sh

# NOTE:
# This is only there to help any one from internal dev group to configure their
# environment with a single command. We are not going to write the readme
# using this script for external users
if [ ! -z "$VIRTUAL_ENV" ]; then
    echo "Deactivating existing virtual enviornment"
    deactivate
fi
python3 -m venv box
source box/bin/activate
pip install --upgrade pip
pip install --force-reinstall -r requirements.txt --no-cache-dir