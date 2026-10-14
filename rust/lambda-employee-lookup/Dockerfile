FROM public.ecr.aws/lambda/provided:al2023-arm64

# Copy the bootstrap binary built by cargo-lambda
COPY target/lambda/dsql-employee-lookup/bootstrap ${LAMBDA_RUNTIME_DIR}/bootstrap

# Set the handler
CMD ["bootstrap"]
