require 'hello_dsql'

describe 'perform smoke tests' do 
    it 'does not raise any exception' do 

        expect {
            example(ENV["CLUSTER_ENDPOINT"], ENV["REGION"])
        }.not_to raise_error
    end
end 
