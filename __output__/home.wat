(module 
	(func $+ (param $+::a i32) (param $+::b i32) (result i32) local.get $+::a local.get $+::b i32.add) 
	(func $- (param $-::a i32) (param $-::b i32) (result i32) local.get $-::a local.get $-::b i32.sub) 
	(func $eq (param $eq::a i32) (param $eq::b i32) (result i32) local.get $eq::a local.get $eq::b i32.sub i32.const 0 i32.eq) 
	(func $generic (param $generic::s i32) (result i32) 
		(if local.get $generic::s i32.const 2 i32.eq 
			(then local.get $generic::s call $generic) 
		(else 
		(if i32.const 0xFFFFFFFF 
			(then local.get $generic::s call $generic))))) 
	(func $BVV (param $BVV::a i32) (param $BVV::b i32) (result i32) call $BVV::bf) 
	(func $TST (param $TST::l i32) (param $TST::ab i32) (result i32) local.get $TST::l call $TST::b i32.add) 
	(func $BVV::bf (result i32) local.get $BVV::b local.get $BVV::a call $BVV) 
	(func $TST::b (result i32) local.get $TST::ab local.get $TST::l call $generic i32.add) 
(export $+ $- $eq $generic $BVV $TST)) 