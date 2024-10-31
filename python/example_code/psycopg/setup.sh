#!/bin/sh

# NOTE:
# This is only there to help any one from xanadu-dev to configure their
# environment with a single command. We are not going to write the readme
# using this script for external users
deactivate
python3 -m venv psycopg_venv
source psycopg_venv/bin/activate
pip install --upgrade pip
pip install --force-reinstall -r requirements.txt
