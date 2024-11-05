require 'connection_util'

describe 'When testing a basic connection to DSQL' do 
    it 'The connect method return the selected value: 1' do 
        cluster_endpoint = 'pqabtsiczsmygnwuykjcsrnowy.c0001.us-east-1.prod.sql.axdb.aws.dev'
        region = 'us-east-1'
        pg_connection = ConnectionUtil.get_connection(cluster_endpoint, region)
                        
        pg_result = pg_connection.exec('SELECT 1')
        expect(pg_result.getvalue(0, 0)).to eq '1' 
    end
end 