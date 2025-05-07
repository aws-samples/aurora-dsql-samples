require 'hello_dsql'

describe 'perform smoke tests' do 
    it 'does not raise any exception' do 
        expect {
            main()
        }.not_to raise_error
    end
end 