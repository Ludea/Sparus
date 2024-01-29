pub mod luclerpc {
  tonic::include_proto!("luclerpc");
}

use luclerpc::{lucle_client::LucleClient, Empty};
use tokio_stream::StreamExt;
use tonic::transport::Channel;

async fn streaming_echo(client: &mut LucleClient<Channel>, num: usize) {
  let stream = client
    .server_streaming_echo(Empty {})
    .await
    .unwrap()
    .into_inner();

  let mut stream = stream.take(num);
  while let Some(item) = stream.next().await {
    println!("\treceived: {}", item.unwrap().plugin);
  }
}

pub async fn start_rpc_client() -> Result<(), Box<dyn std::error::Error + Send>> {
  if let Ok(mut client) = LucleClient::connect("http://127.0.0.1:50051").await {
    streaming_echo(&mut client, 17).await;
  }
  Ok(())
}
