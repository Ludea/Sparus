pub mod pb {
  tonic::include_proto!("grpc.examples.echo");
}

use pb::{echo_client::EchoClient, Empty};
use tokio_stream::{StreamExt};
use tonic::transport::Channel;

async fn streaming_echo(client: &mut EchoClient<Channel>, num: usize) {
  let stream = client
        .server_streaming_echo(Empty {
           // message: "foo".into(),
        })
        .await
        .unwrap()
        .into_inner();

    let mut stream = stream.take(num);
    while let Some(item) = stream.next().await {
        println!("\treceived: {}", item.unwrap().plugin);
    }
}

pub async fn start_rpc_client() -> Result<(), Box<dyn std::error::Error + Send>> {
  let mut client = EchoClient::connect("http://127.0.0.1:50051").await.unwrap();

  println!("\r\nBidirectional stream echo:");
  streaming_echo(&mut client, 17).await;

  Ok(())
}
