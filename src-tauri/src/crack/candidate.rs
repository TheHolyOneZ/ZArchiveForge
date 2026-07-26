

pub trait CandidateSource: Send {

    fn total(&self) -> Option<u64>;


    fn position(&self) -> u64;


    fn seek(&mut self, index: u64);


    fn next_batch(&mut self, n: usize, out: &mut Vec<String>) -> usize;
}
