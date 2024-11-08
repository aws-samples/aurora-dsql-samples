use std::time::{Duration, SystemTime};

use aws_credential_types::provider::ProvideCredentials;
use aws_sigv4::{
    http_request::{sign, SignableBody, SignableRequest, SignatureLocation, SigningSettings},
    sign::v4::SigningParams,
};

// Default expiry is 15 minutes
const DEFAULT_EXPIRY: Duration = Duration::new(900, 0);

pub async fn generate_db_auth_token(
    hostname: impl AsRef<str>,
    region: impl AsRef<str>,
    provide_credentials: impl ProvideCredentials,
    expiry_time: Option<Duration>
) -> anyhow::Result<String> {
    let credentials = provide_credentials.provide_credentials().await?;

    let identity = credentials.into();

    let mut signing_settings = SigningSettings::default();
    signing_settings.expires_in = Some(expiry_time.unwrap_or(DEFAULT_EXPIRY));
    signing_settings.signature_location = SignatureLocation::QueryParams;

    // The token expiration time is optional, and the default value 900 seconds
    let signing_params = SigningParams::builder()
        .identity(&identity)
        .region(region.as_ref())
        .name("xanadu")
        .time(SystemTime::now())
        .settings(signing_settings)
        .build()?;

    let url = format!("https://{}/?Action=DbConnectSuperuser", hostname.as_ref());

    let signable_request =
        SignableRequest::new("GET", &url, std::iter::empty(), SignableBody::Bytes(&[]))?;

    let (signing_instructions, _signature) =
        sign(signable_request, &signing_params.into())?.into_parts();

    let mut url = url::Url::parse(&url)?;
    for (name, value) in signing_instructions.params() {
        url.query_pairs_mut().append_pair(name, value);
    }

    Ok(url.to_string().split_off("https://".len()))
}
