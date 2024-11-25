Before("@dsql") do
  @service = Aws::DSQL::Resource.new
  @client = @service.client
end

After("@dsql") do
  # shared cleanup logic
end
