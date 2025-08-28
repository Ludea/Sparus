pub mod sparus {
  tonic::include_proto!("sparus");
}

use sparus::{event_client::EventClient, Empty};
use tokio_stream::StreamExt;
use tonic::transport::Channel;

async fn streaming_echo(client: &mut EventClient<Channel>, num: usize) {
  let stream = client.sparus(Empty {}).await.unwrap().into_inner();

  let mut stream = stream.take(num);
  while let Some(item) = stream.next().await {
    println!("\treceived: {}", item.unwrap().plugin);
  }
}

pub async fn start_rpc_client(url: String) -> Result<(), Box<dyn std::error::Error + Send>> {
  if let Ok(mut client) = EventClient::connect(url).await {
    streaming_echo(&mut client, 17).await;
  }
  Ok(())
}
