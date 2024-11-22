require 'hello_dsql'

describe 'perform smoke tests' do 
    it 'does not raise any exception' do 

        expect {
            example()
        }.not_to raise_error
    end
end 