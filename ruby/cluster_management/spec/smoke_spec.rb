require 'example'

describe 'perform multi-region smoke tests' do 
    it 'does not raise any exception' do 

        expect {
            multi_region()
        }.not_to raise_error
    end
end 

describe 'perform single-region smoke tests' do 
    it 'does not raise any exception' do 

        expect {
            single_region()
        }.not_to raise_error
    end
end
