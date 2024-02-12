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
	(func $BVV (param $BVV::a i32) (param $BVV::b i32) (result i32) local.get $BVV::a local.get $BVV::b call $BVV::bf) 
	(func $TST (param $TST::l i32) (param $TST::ab i32) (result i32) i32.const 1 i32.const 2 local.get $TST::l local.get $TST::ab call $TST::cf) 
	(func $BVV::bf (param $BVV::a i32) (param $BVV::b i32) (result i32) local.get $BVV::b local.get $BVV::a call $BVV) 
	(func $TST::b (param $TST::l i32) (param $TST::ab i32) (result i32) local.get $TST::ab local.get $TST::l call $generic i32.add) 
	(func $TST::cf (param $TST::cf::w i32) (param $TST::cf::x i32) (param $TST::l i32) (param $TST::ab i32) (result i32) 
		(if local.get $TST::l local.get $TST::ab call $TST::b i32.const 2 i32.eq 
			(then local.get $TST::cf::w) 
		(else 
		(if i32.const 0xFFFFFFFF 
			(then local.get $TST::cf::x))))) 
(export $+ $- $eq $generic $BVV $TST)) 