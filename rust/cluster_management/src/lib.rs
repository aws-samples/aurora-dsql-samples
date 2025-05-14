// This file re-exports the functions from the example files so they can be used in tests

pub mod create_multi_region_clusters {
    include!("bin/create_multi_region_clusters.rs");
}

pub mod create_single_region_cluster {
    include!("bin/create_single_region_cluster.rs");
}

pub mod delete_multi_region_clusters {
    include!("bin/delete_multi_region_clusters.rs");
}

pub mod delete_single_region_cluster {
    include!("bin/delete_single_region_cluster.rs");
}

pub mod get_cluster {
    include!("bin/get_cluster.rs");
}

pub mod update_cluster {
    include!("bin/update_cluster.rs");
}
